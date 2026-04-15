export async function listUsers(client) {
  return client.from('users').select('*');
}
