import "reflect-metadata";
import { UserController } from "./api/user/userController.js";
import { App } from "./main.js";

const userController = new UserController();
const app = new App([
    userController,
]);

app.start();