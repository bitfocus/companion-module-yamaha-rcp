import { addExtensionMethods } from './hubextensions';
import * as Integrations from './integrations';
export type { RequestInstrumentationOptions } from './browser';
export type { SpanStatusType } from './span';
export { Integrations };
export { BrowserTracing, BROWSER_TRACING_INTEGRATION_ID } from './browser';
export { Span, spanStatusfromHttpCode } from './span';
export { SpanStatus } from './spanstatus';
export { Transaction } from './transaction';
export { instrumentOutgoingRequests, defaultRequestInstrumentationOptions } from './browser';
export { IdleTransaction } from './idletransaction';
export { startIdleTransaction } from './hubextensions';
export { addExtensionMethods };
export { extractTraceparentData, getActiveTransaction, hasTracingEnabled, stripUrlQueryAndFragment, TRACEPARENT_REGEXP, } from './utils';
//# sourceMappingURL=index.d.ts.map