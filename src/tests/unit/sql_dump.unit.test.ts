/// <reference types="jest" />
import { validateEnvVariables } from '../../sql_dump'

describe('validateEnvVariables', () => {
    beforeEach(() => {
        //jest.resetModules(); // clears module cache if modules read env on import    
        process.env.DB_HOST = 'localhost';
        process.env.DB_PORT = '3306';
        process.env.DB_USER = 'user';
        process.env.DB_PASSWORD = 'pass';
        process.env.DB_NAME = 'test_db';
        process.env.NO_TRAIL = 'true';
        process.env.NO_COMMENTS = 'false';
    });

    it('should use the mocked env variables', () => {
        expect(process.env.DB_HOST).toBe('localhost');
        expect(process.env.DB_PORT).toBe('3306');
        expect(process.env.DB_USER).toBe('user');
        expect(process.env.DB_PASSWORD).toBe('pass');
        expect(process.env.DB_NAME).toBe('test_db');
        expect(process.env.NO_TRAIL).toBe('true');
        expect(process.env.NO_COMMENTS).toBe('false');
    });
});