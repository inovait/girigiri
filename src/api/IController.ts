import { Router } from 'express';

export interface IController {
    path: string;       // base path
    router: Router;     // express router instance
}