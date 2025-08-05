import { Repository } from 'typeorm';
import { MySqlDataSource } from '../../database/data-source.js';
import { User } from '../../database/entity/user.entity.js';


export class UserRepository {
  private repo: Repository<User>;

  constructor() {
    this.repo = MySqlDataSource.getRepository(User);
  }

  findAll(): Promise<User[]> {
    return this.repo.find();
  }

  createAndSave(data: Partial<User>): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }
}
