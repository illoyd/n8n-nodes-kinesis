import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getQldb, QldbRepository } from './qldb-service';
import { Value } from 'ion-js/dist/commonjs/es6/dom';

export class AwsQldb implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS QLDB',
		name: 'AwsQldb',
		// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg
		icon: 'file:amazon-qldb.png',
		group: ['transform'],
		version: 1,
		description: 'Sends commands to an Amazon QLDB',
		defaults: {
			name: 'AWS QLDB',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'aws',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Ledger',
				name: 'ledgerName',
				type: 'string',
				default: '',
				placeholder: 'ledgerName',
				description: 'Name of the ledger',
			},
			{
				displayName: 'Table',
				name: 'tableName',
				type: 'string',
				default: '',
				placeholder: 'tableName',
				description: 'Name of the database',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Select', value: 'select' },
					{ name: 'Create', value: 'insert' },
					{ name: 'Update', value: 'update' },
					{ name: 'Create or Update', value: 'upsert' },
				],
				default: 'select',
				placeholder: 'ledgerName',
				description: 'Name of the ledger',
			},
			{
				displayName: 'Where',
				name: 'where',
				type: 'json',
				default: '',
				description: 'The where clause used for filtering',
				displayOptions: { show: { operation: ['select', 'update', 'upsert'] } },
			},
			{
				displayName: 'Document',
				name: 'document',
				type: 'json',
				default: '',
				description: 'The document contents',
				displayOptions: { show: { operation: ['insert', 'update', 'upsert'] } },
			},
			{
				displayName: 'Flatten results',
				name: 'flattenResults',
				type: 'boolean',
				default: false,
				description:
					'Unpack document updates; note that this may create more or fewer outputs than inputs',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let response = [];

		try {
			const credentials = await this.getCredentials('aws', 0);
			const ledgerName = this.getNodeParameter('ledgerName', 0) as string;
			const tableName = this.getNodeParameter('tableName', 0) as string;
			const flattenResults = this.getNodeParameter('flattenResults', 0) as string;

			// Create the Driver and Repository
			const db = getQldb(ledgerName, {
				region: credentials?.region as string,
				credentials: {
					accessKeyId: credentials?.accessKeyId as string,
					secretAccessKey: credentials?.secretAccessKey as string,
				},
			});
			const repository = new QldbRepository(tableName);

			// Perform the action on each item
			for (let i = 0; i < items.length; i++) {
				const operation = this.getNodeParameter('operation', i) as
					| 'all'
					| 'select'
					| 'insert'
					| 'update'
					| 'upsert';

				const results = await db.executeLambda(async (txn) => {
					let docs: Value[] = [];
					switch (operation) {
						case 'all':
							docs.push(...(await repository.all(txn)));
							break;
						case 'select':
							docs.push(
								...(await repository.where(
									txn,
									validateJson(this.getNodeParameter('where', i, undefined) as string),
								)),
							);
							break;
						case 'insert':
							docs.push(
								...(await repository.insert(
									txn,
									validateJson(this.getNodeParameter('document', i, undefined) as string),
								)),
							);
							break;
						case 'update':
							docs.push(
								...(await repository.update(
									txn,
									validateJson(this.getNodeParameter('document', i, undefined) as string),
									validateJson(this.getNodeParameter('where', i, undefined) as string),
								)),
							);
							break;
						case 'upsert':
							docs.push(
								...(await repository.upsert(
									txn,
									validateJson(this.getNodeParameter('where', i, undefined) as string),
									validateJson(this.getNodeParameter('document', i, undefined) as string),
								)),
							);
							break;
					}

					let documentIds = new Set<string>();
					return Promise.all(
						docs
							// First, apply a unique filter
							.filter((d) => {
								const documentId = d.get('documentId')?.stringValue();
								if (documentId && !documentIds.has(documentId)) {
									documentIds.add(documentId);
									return true;
								}
								return false;
							})
							// Then, hydrate
							.map(async (d) => {
								if (d.fieldNames().length === 1)
									return await repository.find(txn, d.get('documentId')!.stringValue()!);
								return d;
							}),
					);
				});

				response.push({ results });
			}

			// Flatten results if requested
			if (flattenResults) response = response.flatMap((r) => r.results);

			console.log(JSON.stringify(response, null, 2));
			return [this.helpers.returnJsonArray(response)];
		} catch (error) {
			if (this.continueOnFail()) {
				return [this.helpers.returnJsonArray({ error: error.message })];
			} else {
				throw error;
			}
		}
	}
}

export function validateJson(json: string | undefined): any {
	let result;
	try {
		result = JSON.parse(json!);
	} catch (exception) {
		result = undefined;
	}
	return result;
}
