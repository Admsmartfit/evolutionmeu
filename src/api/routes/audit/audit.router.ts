import { RequestHandler, Router } from 'express';

import { AuditConfigRouter } from './auditConfig.router';
import { AuditRecipientRouter } from './auditRecipient.router';
import { ContactRoleMappingRouter } from './contactRoleMapping.router';

export class AuditRouter {
  public readonly router: Router;

  constructor(...guards: RequestHandler[]) {
    this.router = Router();
    this.router.use('/contacts', new ContactRoleMappingRouter(...guards).router);
    this.router.use('/config', new AuditConfigRouter(...guards).router);
    this.router.use('/recipients', new AuditRecipientRouter(...guards).router);
  }
}
