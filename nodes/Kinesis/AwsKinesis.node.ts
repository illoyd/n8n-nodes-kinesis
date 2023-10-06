import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

const Kinesis = require('lifion-kinesis');

export class AwsKinesis implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS Kinesis',
		name: 'awsKinesis',
		icon: 'file:aws-kinesis.svg',
		group: ['transform'],
		version: 1,
		description: 'Sends messages to a Kinesis stream',
		defaults: {
			name: 'AWS Kinesis',
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
				displayName: 'Stream',
				name: 'streamName',
				type: 'string',
				default: '',
				placeholder: 'stream-name',
				description: 'Name of the stream to publish to',
			},
			{
				displayName: 'Send Input Data',
				name: 'sendInputData',
				type: 'boolean',
				default: true,
				description: 'Whether to send the the data the node receives as JSON to Kinesis',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				displayOptions: {
					show: {
						sendInputData: [false],
					},
				},
				default: '',
				description: 'The message to be sent',
			},
			{
				displayName: 'Allow Topic Creation',
				name: 'createStreamIfNeeded',
				type: 'boolean',
				default: false,
				description: 'Whether or not to create the stream if it does not already exist',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let responseData: any;

		try {
			const credentials = await this.getCredentials('aws');
			const streamName = this.getNodeParameter('streamName', 0) as string;
			const createStreamIfNeeded = Boolean(this.getNodeParameter('createStreamIfNeeded', 0));
			const sendInputData = this.getNodeParameter('sendInputData', 0) as boolean;

			// Create the stream publisher
			const kinesis = new Kinesis({
				region: credentials?.region,
				accessKeyId: credentials?.accessKeyId,
				secretAccessKey: credentials?.secretAccessKey,
				// dynamoDb: {
				// 	region: credentials?.region,
				// 	accessKeyId: credentials?.accessKeyId,
				// 	secretAccessKey: credentials?.secretAccessKey,
				// },
				endpoint: 'http://localhost:4566',
				streamName,
				createStreamIfNeeded,
				logger: console,
			});

			let records = [];
			let data: string | Buffer;

			for (let i = 0; i < items.length; i++) {
				if (sendInputData) data = JSON.stringify(items[i].json);
				else data = this.getNodeParameter('message', i) as string;

				records.push({ data });
			}

			responseData = await kinesis.putRecords({
				streamName,
				records,
			});

			if (responseData.length === 0) {
				responseData.push({
					success: true,
				});
			}

			return [this.helpers.returnJsonArray(responseData.records)];
		} catch (error) {
			if (this.continueOnFail()) {
				return [this.helpers.returnJsonArray({ error: error.message })];
			} else {
				throw error;
			}
		}
	}
}
