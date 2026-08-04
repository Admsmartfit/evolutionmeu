import { RouterBroker } from '@api/abstract/abstract.router';
import {
  ContactRoleMappingDto,
  ContactRoleMappingFindDto,
  ContactRoleMappingUpdateDto,
  EmptyDto,
} from '@api/dto/contactRoleMapping.dto';
import { HttpStatus } from '@api/routes/index.router';
import { contactRoleMappingController } from '@api/server.module';
import { contactRoleMappingSchema, contactRoleMappingUpdateSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export class ContactRoleMappingRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post('/create', ...guards, async (req, res) => {
        const response = await this.dataValidate<ContactRoleMappingDto>({
          request: req,
          schema: contactRoleMappingSchema,
          ClassRef: ContactRoleMappingDto,
          execute: (_, data) => contactRoleMappingController.create(data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .put('/update/:contactId', ...guards, async (req, res) => {
        const response = await this.dataValidate<ContactRoleMappingUpdateDto>({
          request: req,
          schema: contactRoleMappingUpdateSchema,
          ClassRef: ContactRoleMappingUpdateDto,
          execute: (params, data) =>
            contactRoleMappingController.update(params as unknown as { contactId: string }, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .delete('/delete/:contactId', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => contactRoleMappingController.delete(params as unknown as { contactId: string }),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .get('/find', ...guards, async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: (params) => contactRoleMappingController.find(params as unknown as ContactRoleMappingFindDto),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post('/import', ...guards, upload.single('file'), async (req, res) => {
        const response = await this.dataValidate<EmptyDto>({
          request: req,
          schema: null,
          ClassRef: EmptyDto,
          execute: () => contactRoleMappingController.importCsv(req.file as unknown as { buffer: Buffer }),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
