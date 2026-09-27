// arquivos de exemplo importados como texto nos testes (recurso do vitest/vite)
declare module '*.txt?raw' {
  const content: string;
  export default content;
}
