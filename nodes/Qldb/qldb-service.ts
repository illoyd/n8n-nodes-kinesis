import { NodeHttpHandlerOptions } from '@aws-sdk/node-http-handler';
import { Agent } from 'https';
import { QLDBSessionClientConfig } from '@aws-sdk/client-qldb-session';
import { QldbDriver, RetryConfig, TransactionExecutor } from 'amazon-qldb-driver-nodejs';

export function getQldb(ledgerName: string, serviceConfigurationOptions: QLDBSessionClientConfig) {
	const maxConcurrentTransactions = 10;
	const lowLevelClientHttpOptions: NodeHttpHandlerOptions = {
		httpAgent: new Agent({
			maxSockets: maxConcurrentTransactions,
		}),
	};

	// Use driver's default backoff function for this example (no second parameter provided to RetryConfig)
	return new QldbDriver(
		ledgerName,
		serviceConfigurationOptions,
		lowLevelClientHttpOptions,
		maxConcurrentTransactions,
		new RetryConfig(4),
	);
}

export class QldbRepository {
	protected readonly table: string;

	constructor(table: string) {
		this.table = table;
	}

	async all(txn: TransactionExecutor) {
		return this.do(
			txn,
			`SELECT *
       FROM ${this.table} BY documentId`,
		);
	}

	async find(txn: TransactionExecutor, documentId: string) {
		return this.findBy(txn, { documentId });
	}

	async findBy(txn: TransactionExecutor, where: Record<string, unknown>) {
		return (await this.where(txn, where))[0];
	}

	async where(txn: TransactionExecutor, where: Record<string, unknown>) {
		const { fields, values } = this.splitFields(where);
		return this.do(txn, this.selectByQuery(fields), ...values);
	}

	async insert(txn: TransactionExecutor, document: Record<string, unknown>) {
		// Add 'createdAt' if not defined
		document.createdAt ??= new Date(Date.now());
		document.updatedAt ??= document.createdAt;

		return this.do(txn, this.insertQuery(), document);
	}

	async insertInto(
		txn: TransactionExecutor,
		field: string,
		document: Record<string, unknown>,
		where: Record<string, unknown>,
	) {
		const { fields, values } = this.splitFields(where);
		return (await this.do(txn, this.insertIntoQuery(field, fields), ...values, document))[0]
			.get('documentId')!
			.stringValue()!;
	}

	async update(
		txn: TransactionExecutor,
		document: Record<string, unknown>,
		where: Record<string, unknown>,
	) {
		// Add updatedAt if not already set
		document.updatedAt ??= new Date(Date.now());

		// Split the document and where clauses into fields and values
		const u = this.splitFields(document);
		const w = this.splitFieldsWithOperator(where);

		// Assemble the query and execute
		const query = this.updateQuery(u.fields, w.fields);
		return this.do(txn, query, ...u.values, ...w.values);
	}

	async upsert(
		txn: TransactionExecutor,
		where: Record<string, unknown>,
		document: Record<string, unknown>,
	) {
		const existing = await this.where(txn, where);

		// Nothing existing, so insert
		if (existing.length === 0) return this.insert(txn, { ...where, ...document });
		// One found, so update
		else if (existing.length === 1) return this.update(txn, document, where);
		// Otherwise the FIND clause is too wide
		else
			throw Error(
				`Upsert matched multiple documents; searching for ${where}, found ${existing.length} documents`,
			);
	}

	async do(txn: TransactionExecutor, query: string, ...params: unknown[]) {
		console.info('Query:', query, 'with', params);
		return (await txn.execute(query, ...params)).getResultList();
	}

	protected splitFields(obj: Record<string, unknown>) {
		const entries = Object.entries(obj);
		return {
			fields: entries.map((entry) => entry[0]),
			values: entries.map((entry) => entry[1]),
		};
	}

	protected splitFieldsWithOperator(obj: Record<string, unknown>) {
		const entries = Object.entries(obj);
		return {
			fields: entries.map((entry) => ({
				name: entry[0],
				operator: this.operatorForValue(entry[1]),
			})),
			values: entries.map((entry) => entry[1]),
		};
	}

	protected operatorForValue(value: unknown) {
		if (Array.isArray(value)) return 'IN';
		return '=';
	}

	protected joinFields(fields: string[], glue = ' ') {
		const withOperators = fields.map((name) => ({ name, operator: '=' }));
		return this.joinFieldsWithOperator(withOperators, glue);
	}

	protected joinFieldsWithOperator(fields: { name: string; operator: string }[], glue = ' ') {
		return fields.map(({ name, operator }) => `${name} ${operator} ?`).join(glue);
	}

	private selectByQuery(fields: string[]) {
		const where = this.joinFields(fields, ' AND ');
		return `SELECT *
            FROM ${this.table} BY documentId
            WHERE ${where};`;
	}

	private insertQuery() {
		return `INSERT INTO ${this.table}
                VALUE ?;`;
	}

	private insertIntoQuery(field: string, whereFields: string[]) {
		const where = this.joinFields(whereFields, ' AND ');
		return `FROM ${this.table} AS t BY documentId
            WHERE ${where}
            INSERT INTO t.${field} VALUE ?;`;
	}

	private updateQuery(updateFields: string[], whereFields: { name: string; operator: string }[]) {
		const update = this.joinFields(updateFields, ', ');
		const where = this.joinFieldsWithOperator(whereFields, ' AND ');
		return `UPDATE ${this.table} BY documentId
            SET ${update}
            WHERE ${where};`;
	}
}
