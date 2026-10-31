'use strict';

// Dependencies are backend capabilities, never fields supplied by the Router.
// No secret is persisted here or included in the resolved public identity.
class AccountRouting {
  constructor({authorize, listAccounts, readCredentials, walletSigner} = {}) {
    this.authorize = authorize;
    this.listAccounts = listAccounts;
    this.readCredentials = readCredentials;
    this.walletSigner = walletSigner;
  }

  async bind(intent, action, proof) {
    if (typeof this.authorize !== 'function' || typeof this.listAccounts !== 'function') {
      throw Error('TRADING_ACCOUNT_AUTHORITY_UNAVAILABLE');
    }
    // Authorizer must verify the proof against the entire normalized intent/action.
    const principal = await this.authorize({intent, action, proof});
    if (!principal || !principal.clientId || !['ADMIN', 'USER'].includes(principal.role)) {
      throw Error('TRADING_ACCOUNT_UNAUTHORIZED');
    }
    const exchange = String(intent.exchange || '').toUpperCase();
    const market = String(intent.market_type || 'SPOT').toUpperCase();
    const chain = intent.chain ? String(intent.chain).toLowerCase() : null;
    if (intent.account != null && (typeof intent.account !== 'string' || !intent.account)) {
      throw Error('TRADING_ACCOUNT_REFERENCE_INVALID');
    }
    if (!['BINANCE', 'KRAKEN', 'OKX', 'GMX'].includes(exchange)) throw Error('TRADING_BROKER_UNSUPPORTED');
    if (exchange === 'GMX' && !['arbitrum', 'avalanche'].includes(chain)) throw Error('TRADING_CHAIN_REQUIRED');
    const accounts = await this.listAccounts(principal);
    if (!Array.isArray(accounts)) throw Error('TRADING_ACCOUNT_REGISTRY_INVALID');
    const candidates = accounts.filter(a => a && a.owner === principal.clientId && a.enabled === true &&
      a.exchange === exchange && Array.isArray(a.markets) && a.markets.includes(market) &&
      Array.isArray(a.actions) && a.actions.includes(action) &&
      (exchange === 'GMX' ? a.kind === 'DEX' && a.chain === chain : a.kind === 'CEX' && !chain));
    const matches = intent.account ? candidates.filter(a => a.id === intent.account) : candidates.filter(a => a.default === true);
    if (!matches.length) throw Error('TRADING_ACCOUNT_NOT_ASSIGNED');
    if (matches.length !== 1) throw Error('TRADING_ACCOUNT_AMBIGUOUS');
    const account = Object.freeze(JSON.parse(JSON.stringify(matches[0])));
    if (typeof account.id !== 'string' || !account.id) throw Error('TRADING_ACCOUNT_REGISTRY_INVALID');
    const identity = Object.freeze({id: account.id, owner: principal.clientId, exchange, market, chain});
    // Revalidate on every credential/signature use, including after an async wait.
    const recheck = async () => {
      const p = await this.authorize({intent, action, proof});
      if (!p || p.clientId !== principal.clientId || !['ADMIN', 'USER'].includes(p.role)) throw Error('TRADING_ACCOUNT_REVOKED');
      const rows = await this.listAccounts(p);
      const same = Array.isArray(rows) && rows.filter(a => a && a.id === account.id && a.owner === account.owner);
      if (!same || same.length !== 1 || JSON.stringify(same[0]) !== JSON.stringify(account)) throw Error('TRADING_ACCOUNT_REVOKED');
    };
    if (account.kind === 'CEX') {
      if (typeof this.readCredentials !== 'function' || !account.credentialRef) throw Error('TRADING_CREDENTIAL_BRIDGE_UNAVAILABLE');
      return {identity, account: account.id, secretProvider: Object.freeze({get: async requested => {
        if (requested !== exchange) throw Error('TRADING_CREDENTIAL_SCOPE_MISMATCH');
        await recheck();
        const secrets = await this.readCredentials(principal, account.credentialRef, identity);
        if (!secrets || !(secrets.api_key || secrets.apiKey) || !(secrets.api_secret || secrets.apiSecret) ||
            (exchange === 'OKX' && !secrets.passphrase)) throw Error('TRADING_CREDENTIALS_INCOMPLETE');
        await recheck();
        return secrets;
      }})};
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(account.address || '') || !account.walletRef || typeof this.walletSigner !== 'function') {
      throw Error('TRADING_WALLET_SIGNER_UNAVAILABLE');
    }
    return {identity, account: account.address, walletSigner: Object.freeze({signGmxPreparedOrder: async (prepared, details) => {
      if (!details || details.chain !== chain || details.order.account !== account.address) throw Error('TRADING_WALLET_SCOPE_MISMATCH');
      await recheck();
      const signer = await this.walletSigner(principal, account.walletRef, identity);
      if (!signer || typeof signer.signGmxPreparedOrder !== 'function') throw Error('TRADING_WALLET_SIGNER_UNAVAILABLE');
      await recheck();
      return signer.signGmxPreparedOrder(prepared, details);
    }})};
  }
}

module.exports = {AccountRouting};
