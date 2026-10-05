// src/lib/errors.js — Errors the CLI raises on purpose (printed without a stack trace).

export class MagnitCliError extends Error {
  /**
   * @param {string} message — what went wrong
   * @param {string} [hint]  — what the user can do about it
   */
  constructor(message, hint = '') {
    super(message);
    this.name = 'MagnitCliError';
    this.hint = hint;
  }
}
