import { RouterBroker } from '@api/abstract/abstract.router';
import { EmptyDto } from '@api/dto/contactRoleMapping.dto';
import { HttpStatus } from '@api/routes/index.router';
import { messageRetentionController } from '@api/server.module';
import { RequestHandler, Router } from 'express';

export class RetentionRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router.post('/run', ...guards, async (req, res) => {
      const response = await this.dataValidate<EmptyDto>({
        request: req,
        schema: null,
        ClassRef: EmptyDto,
        execute: () => messageRetentionController.runNow(),
      });

      res.status(HttpStatus.CREATED).json(response);
    });
  }

  public readonly router: Router = Router();
}
