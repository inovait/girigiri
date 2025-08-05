// src/controllers/UserController.ts
import { Router, Request, Response } from 'express';
import { IController } from '../IController.js';
import { UserService } from './userService.js';

export class UserController implements IController {
  public path = '/users';
  public router = Router();
  private userService = new UserService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(this.path, this.getAllUsers);
    this.router.post(this.path, this.createUser);
  }

  private getAllUsers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const users = await this.userService.getAllUsers();
      return res.status(200).json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  };

  private createUser = async (req: Request, res: Response): Promise<Response> => {
    try {
      const newUser = await this.userService.createUser(req.body);
      return res.status(201).json(newUser);
    } catch (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  };
}
