
"use strict";

/**
 * Adapter expected to bridge the existing secure Settings > API vault.
 * No API key or private key is stored inside Trading Engine files.
 */
class SecretProvider {
  async get(exchange) {
    throw new Error(`SecretProvider not connected for ${exchange}`);
  }
}

module.exports = { SecretProvider };
