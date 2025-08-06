import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMigration1754479454770 implements MigrationInterface {
    name = 'InitMigration1754479454770'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`migColumn\``);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`migColumn\` varchar(255) NOT NULL`);
    }

}
