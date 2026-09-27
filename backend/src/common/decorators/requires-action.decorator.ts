import { SetMetadata } from '@nestjs/common';
import { ActionKey } from '../../domain';

export const REQUIRES_ACTION = 'kaiju:requires-action';

// Routes whose action depends on the payload are NOT decorated: a transfer is
// an adjacent request, a transit chain or a requisition depending on the
// geography, which is only known once the route is computed. The engine checks
// those itself, inside the transaction.
export const RequiresAction = (action: ActionKey) => SetMetadata(REQUIRES_ACTION, action);
