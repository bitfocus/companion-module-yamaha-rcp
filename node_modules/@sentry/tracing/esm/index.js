import { addExtensionMethods } from './hubextensions.js';
export { addExtensionMethods, startIdleTransaction } from './hubextensions.js';
import * as index from './integrations/index.js';
export { index as Integrations };
import './browser/index.js';
export { Span, spanStatusfromHttpCode } from './span.js';
export { SpanStatus } from './spanstatus.js';
export { Transaction } from './transaction.js';
export { IdleTransaction } from './idletransaction.js';
export { getActiveTransaction, hasTracingEnabled } from './utils.js';
export { BROWSER_TRACING_INTEGRATION_ID, BrowserTracing } from './browser/browsertracing.js';
export { defaultRequestInstrumentationOptions, instrumentOutgoingRequests } from './browser/request.js';
export { TRACEPARENT_REGEXP, extractTraceparentData, stripUrlQueryAndFragment } from '@sentry/utils';

;
;

// Treeshakable guard to remove all code related to tracing

// Guard for tree
if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
  // We are patching the global object with our hub extension methods
  addExtensionMethods();
}
//# sourceMappingURL=index.js.map
