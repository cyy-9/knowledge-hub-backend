import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { ImageProcessService } from './image-process.service';
import { RustfsService } from '../storage/rustfs.service';

describe('ImageProcessService', () => {
  let service: ImageProcessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageProcessService,
        { provide: getEntityManagerToken(), useValue: {} },
        { provide: RustfsService, useValue: { isEnabled: () => false } },
      ],
    }).compile();

    service = module.get<ImageProcessService>(ImageProcessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
