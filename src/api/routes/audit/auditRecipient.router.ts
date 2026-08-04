import { RouterBroker } from '@api/abstract/abstract.router';
import { AuditRecipientDto, AuditRecipientFindDto, AuditRecipientUpdateDto } from '@api/dto/auditRecipient.dto';
import { EmptyDto } from '@api/dto/contactRoleMapping.dto';
import { HttpStatus } from '@api/routes/index.router';
import { auditRecipientController } from '@api/server.module';
import { auditRecipientSchema, auditRecipientUpdateSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

export class AuditRecipientRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post('/create', ...guards, async (req, res) => {
        const response = await this.dataValidate<AuditRecipientDto>({
          request: req,
          schema: auditRecipientSchema,
          ClassRef: AuditRecipientDto,
          execute: (_, data) => auditRecipientController.create(data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put('/update/:recipientId', ...guards, async (req, res) => {
        const response = await this.dataValidate<AuditRecipientUpdateDto>({
          request: req,
          schema: auditRecipientUpdateSchema,
          ClassRef: AuditRecipientUpdateDto,
          execute: (params, data) =>
            auditRecipientController.update(params as unknown as { recipientId: string }, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete('/delete/:recipientId', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditRecipientController.delete(params as unknown as { recipientId: string }),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get('/find', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => auditRecipientController.find(params as unknown as AuditRecipientFindDto),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
