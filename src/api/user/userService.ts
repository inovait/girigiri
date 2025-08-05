import { User } from "../../database/entity/user.entity.js";
import { UserRepository } from "./userRepository.js";

export class UserService {
  private userRepo = new UserRepository();

  async getAllUsers(): Promise<User[]> {
    return this.userRepo.findAll();
  }

  async createUser(data: Partial<User>): Promise<User> {
    return this.userRepo.createAndSave(data);
  }
}
