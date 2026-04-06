export function createClient() {
  return {
    query(sql) {
      return `executed:${sql}`;
    },
  };
}
