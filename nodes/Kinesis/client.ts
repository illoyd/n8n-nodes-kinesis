const Kinesis = require('lifion-kinesis');

export class N8nKinesisClient extends Kinesis {
	private _isListening = false;

	constructor(options: {}) {
		super(options);
	}

	public async startConsumer() {
		if (this._isListening) {
			console.log('Called startConsumer when already listening; ignoring');
		} else {
			this._isListening = true;
			return super.startConsumer();
		}
	}

	public async stopConsumer() {
		this._isListening = false;
		return super.stopConsumer();
	}

	public get isListening() {
		return this._isListening;
	}
}
