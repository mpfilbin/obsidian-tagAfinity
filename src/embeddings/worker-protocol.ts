export type WorkerRequest =
	| { type: 'init'; id: number; model: string }
	| { type: 'embed'; id: number; model: string; texts: string[] };

export type WorkerResponse =
	| { type: 'ready'; id: number }
	| { type: 'result'; id: number; vectors: number[][] }
	| { type: 'error'; id: number; message: string }
	/** Diagnostic line from inside the worker; surfaced in the plugin's debug log. */
	| { type: 'log'; message: string };
