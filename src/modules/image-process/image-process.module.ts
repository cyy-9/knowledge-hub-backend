import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageProcessService } from './image-process.service';
import { ImageProcessController } from './image-process.controller';
import { ImageProcessEntity } from './entities/image-process.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ImageProcessEntity])],
  controllers: [ImageProcessController],
  providers: [ImageProcessService],
})
export class ImageProcessModule {}
