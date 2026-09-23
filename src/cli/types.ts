export type CliIo = {
  readonly isTTY: boolean
  ask(question: string): Promise<string>
  askPassword(question: string): Promise<string>
  write(message: string): void
}
