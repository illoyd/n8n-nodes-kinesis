import type {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
} from 'n8n-workflow';
import { N8nKinesisClient } from './client';

export class AwsKinesisTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS Kinesis Trigger',
		name: 'AwsKinesisTrigger',
		icon: 'file:aws-kinesis.svg',
		group: ['trigger'],
		version: [1, 1.1],
		description: 'Consume messages from a Kinesis data stream',
		subtitle: '={{$parameter["streamName"]}}',
		defaults: {
			name: 'AWS Kinesis Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'aws',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Stream Name',
				name: 'streamName',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'stream-name',
				description: 'Name of the stream to consume from',
			},
			{
				displayName: 'Consumer Group',
				name: 'consumerGroup',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'n8n-kinesis',
				description: 'Name of the consumer group',
			},
			{
				displayName: 'Allow Topic Creation',
				name: 'createStreamIfNeeded',
				type: 'boolean',
				default: false,
				description: 'Whether or not to create the stream if it does not already exist',
			},
			{
				displayName: 'Read Messages From Beginning',
				name: 'fromBeginning',
				type: 'boolean',
				default: true,
				description: 'Whether to read messages from the beginning of the stream',
			},
			{
				displayName: 'Simplify Response',
				name: 'simplifyResponse',
				type: 'options',
				default: 'record',
				options: [
					{ name: 'Message', value: 'message' },
					{ name: 'Record', value: 'record' },
					{ name: 'Data', value: 'data' },
				],
				description:
					'Whether to return a simplified version of the response instead of the raw data',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const credentials = await this.getCredentials('aws');
		const streamName = this.getNodeParameter('streamName') as string;
		const consumerGroup = this.getNodeParameter('consumerGroup') as string;
		const simplifyResponse = this.getNodeParameter('simplifyResponse') as string;
		const createStreamIfNeeded = Boolean(this.getNodeParameter('createStreamIfNeeded'));
		const fromBeginning = Boolean(this.getNodeParameter('fromBeginning'));

		const safeParse = (input: string): string | object => {
			try {
				return JSON.parse(input);
			} catch (e) {
				return input;
			}
		};

		const kinesis = new N8nKinesisClient({
			region: credentials?.region,
			accessKeyId: credentials?.accessKeyId,
			secretAccessKey: credentials?.secretAccessKey,
			dynamoDb: {
				region: credentials?.region,
				accessKeyId: credentials?.accessKeyId,
				secretAccessKey: credentials?.secretAccessKey,
			},
			endpoint: 'http://localhost:4566',
			streamName,
			consumerGroup,
			createStreamIfNeeded,
			initialPositionInStream: fromBeginning ? 'TRIM_HISTORY' : 'LATEST',
			logger: console,
			// usePausedPolling: true,
		});

		// Attach events
		kinesis.on('data', (data: any) => {
			// Process body
			data.records.forEach((record: any) => {
				// If a buffer, convert to a string
				if (Buffer.isBuffer(record.data))
					record.data = Buffer.from(record.data, 'base64').toString();

				console.log('first', record.data);

				// If a string, try to parse as JSON
				if (typeof record.data === 'string') record.data = safeParse(record.data);

				console.log('second', record.data);

				// If still a string, wrap into a document for ease of reference
				if (typeof record.data === 'string') record.data = { data: record.data };
			});

			// Select what to return
			switch (simplifyResponse) {
				case 'message':
					this.emit([this.helpers.returnJsonArray(data)]);
					break;
				case 'record':
					this.emit([this.helpers.returnJsonArray(data.records)]);
					break;
				case 'data':
					this.emit([this.helpers.returnJsonArray(data.records.map((r: any) => r.data))]);
					break;
			}
		});

		// Start!
		console.log('pre startConsumer');
		await kinesis.startConsumer();
		console.log('post startConsumer');

		// The "closeFunction" function gets called by n8n whenever
		// the workflow gets deactivated and so clean up.
		async function closeFunction() {
			console.log('Received closeFunction');
			await kinesis.stopConsumer();
		}

		// The "manualTriggerFunction" function gets called by n8n
		// when a user is in the workflow editor and starts the
		// workflow manually. So the function has to make sure that
		// the emit() gets called with similar data like when it
		// would trigger by itself so that the user knows what data
		// to expect.
		async function manualTriggerFunction() {
			console.log('Received manualTriggerFunction');
			return kinesis.startConsumer();
		}

		return {
			closeFunction,
			manualTriggerFunction,
		};
	}
}
