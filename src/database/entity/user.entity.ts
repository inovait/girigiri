import { Column, Entity, PrimaryGeneratedColumn } from "typeorm"

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({length : 100})
    username!: string;

    @Column()
    email!: string;
    
    @Column({name: 'display_name'})
    display_name!: string;
}