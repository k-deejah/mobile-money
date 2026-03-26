import { pool } from "../config/database";

export interface User {
  id: string;
  phoneNumber: string;
  kycLevel: string;
  email?: string;
  two_factor_secret?: string | null;
  backup_codes?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserModel {
  async findById(id: string): Promise<User | null> {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      kycLevel: row.kyc_level,
      email: row.email,
      two_factor_secret: row.two_factor_secret ?? null,
      backup_codes: row.backup_codes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateEmail(id: string, email: string): Promise<void> {
    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [email, id]);
  }
}
