export function Table({ rows }) {
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
