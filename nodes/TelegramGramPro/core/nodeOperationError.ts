import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';

const helperNode = {
	name: 'Telegram GramPro',
	type: 'n8n-nodes-telegram-grampro.helper',
	position: [0, 0] as [number, number],
	parameters: {},
} as never;

type ErrorContext = Pick<IExecuteFunctions, 'getNode'>;

type NodeErrorOptions = {
	context?: ErrorContext;
	itemIndex?: number;
	message?: string;
};

type CreateNodeErrorOptions = Omit<NodeErrorOptions, 'message'> & {
	cause?: unknown;
};

export function asNodeOperationError(
	error: unknown,
	options: NodeErrorOptions = {},
): NodeOperationError {
	if (error instanceof NodeOperationError) {
		return error;
	}

	const node = options.context?.getNode() ?? helperNode;

	if (error instanceof Error) {
		return new NodeOperationError(node, error, {
			itemIndex: options.itemIndex,
			message: options.message,
		});
	}

	return new NodeOperationError(node, options.message ?? String(error), {
		itemIndex: options.itemIndex,
	});
}

export function createNodeOperationError(
	message: string,
	options: CreateNodeErrorOptions = {},
): NodeOperationError {
	return asNodeOperationError(options.cause ?? message, {
		context: options.context,
		itemIndex: options.itemIndex,
		message,
	});
}
