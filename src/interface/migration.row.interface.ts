import type { RowDataPacket } from "mysql2/promise";

export interface MigrationRow extends RowDataPacket {
    name: string;
}