import { Test, TestingModule } from '@nestjs/testing';
import { ImageProcessController } from './image-process.controller';
import { ImageProcessService } from './image-process.service';

describe('ImageProcessController', () => {
  let controller: ImageProcessController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImageProcessController],
      providers: [
        {
          provide: ImageProcessService,
          useValue: {
            compress: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ImageProcessController>(ImageProcessController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
