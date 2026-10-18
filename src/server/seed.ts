// Creates an account directly (first admin, tests). Real accounts are created by Admin on the People page.
import { insertAccount } from '@/modules/identity/service';

export async function seedUser(u: { username: string; name: string; password: string; role: string }) {
  return insertAccount(u);
}
