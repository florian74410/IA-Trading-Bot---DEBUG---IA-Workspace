'use strict';
/* Reviewed P2.2 *static* triage only. Membership is not proof of freeze
 * coverage, and never grants write permission or backup authorization.
 * Each entry maps to a narrow group and must be reviewed if the code changes.
 */
const GROUPS=Object.freeze({
 'bank-excluded':[
  'Bank/Core/bitcoin_transfer_module_v1.js','Bank/Core/evm_transfer_module_v1.js',
  'Bank/Core/solana_transfer_module_v1.js','Bank/Core/swap_bridge_service_v2.js',
  'Bank/Core/transfer_service_v2.js','Bank/Core/vault_registry.js',
  'Bank/Core/wallet_service_v2.js'
 ],
 'user-management-exclusive-mode':[
  // Reviewed real-mode writers. Not qualified for the experimental snapshot
  // coordinator: authenticated mode rejects every *_TRIAL activation flag.
  // CLI migration requires an explicit offline operator confirmation.
  'Core/Clients/UserManagement/cli.js','Core/Clients/UserManagement/migration.js',
  'Core/Clients/UserManagement/store.js','Core/Clients/UserManagement/legacy_vault.js',
  'Core/Clients/UserManagement/legacy_data.js',
  // Encrypted preferences + secrets in the existing Auth21 DB; no hot-snapshot claim.
  'Core/Clients/UserManagement/trading_vault.js'
 ],
 'operator-control-outside-snapshot':[
  // Read-only O_RDONLY key descriptor; syntactic fs.openSync candidate only.
  'Core/Clients/auth21_trading_key_provider.js',
  // v2.3 runtime/replay/ADMIN state: exclusive-mode writers, not hot-snapshot qualified.
  'Core/Clients/auth21_trading_replay_v2.js',
  'services/trading-engine/trading_admin_ledger_v2.js',
  // P4/P5 share the existing ADMIN SQLite file. Offline backup only; no hot snapshot claim.
  'services/trading-engine/trading_admin_controller_v2.js',
  'services/trading-engine/trading_draining_v2.js',
  'services/trading-engine/trading_runtime_state_v2.js',
  // Empty persistent lock inode only; kernel lease excludes Core/CLI writers.
  'Core/Clients/auth21_local_owner_lock.js',
  'Core/Admin/admin_console.js','Core/Admin/CP1/parser.js','Core/Admin/log_reader.js',
  'Core/Admin/restart_all.js','Core/Admin/service_registry.js',
  'Core/Admin/stop_total.js','launcher.js',
  'Tools/core_router_smoke.js','Tools/firewall_smoke.js','Tools/marketdata_smoke.js',
  'Tools/orchestrator_sqlite_smoke.js','Tools/persistence_volume_smoke.js',
  'Tools/router_smoke.js','Tools/sqlite_preflight.js','Tools/ssh_ui_bridge.js',
  'Tools/storage_preflight.js','Tools/trading_static_audit.js',
  'Tools/ui_core_router_smoke.js'
 ],
 'coordinator-and-auth-fixture':[
  // Disposable keys/accounts/ledgers, no production writers.
  'services/trading-engine/tests/test_trading_p3_multiprocess_v252.js',
  'services/trading-engine/tests/test_trading_p3_qualification_v252.js',
  'services/trading-engine/tests/test_trading_p4_p5_v253.js',
  // Reviewed temporary-only fixtures; never production writers.
  'services/trading-engine/tests/test_trading_admin_auth21_binding_v2.js',
  'services/trading-engine/tests/test_trading_admin_bridge_key_v2.js',
  'services/trading-engine/tests/test_trading_admin_controller_v2.js',
  'services/trading-engine/tests/test_trading_admin_p3_security.js',
  'services/trading-engine/tests/test_trading_runtime_state_v2.js',
  'services/trading-engine/tests/test_trading_logs_v2.js',
  'tests/test_v2_4_1_cp1_path.js', // isolated temporary CP key and audit fixture only
  'Core/Backup/auth21_core_local_trial_wiring.js',
  'Core/Backup/auth21_durable_snapshot_writer.js',
  'Core/Backup/auth21_snapshot_control.js','Core/Backup/snapshot_coordinator.js',
  'Core/Clients/auth21_admin_store.js','Core/Clients/auth21_first_admin_trial.js',
  'Core/Clients/auth21_http_boundary.js',
  'Core/Clients/auth21_indicator_fixture_writer.js',
  'Core/Clients/auth21_engine_business_ingress.js',
  'Core/Clients/auth21_durable_business_replay.js',
  'Core/Clients/auth21_core_business_http.js',
  'Core/Clients/auth21_router_business_forward.js',
  'Core/Clients/auth21_session_store.js',
  'Core/Clients/client_crypto.js','Core/Clients/password_hasher_v2.js'
 ],
 'supporting-infrastructure':[
  'Core/Communication/communication_router_v1.js',
  'Core/Firewall/firewall_service.js','Core/Firewall/Workers/protection_worker.js',
  'Core/Server/server.js','Core/Shared/paths.js','Core/Shared/sqlite_compat.js',
  'Frontend/JS/admin_controller_v1.0.js'
 ],
 'engine-and-telemetry':[
  // JSONL + SQLite mirror; gate tested, global writer coverage still incomplete.
  'services/trading-engine/trading_logs_v2.js',
  'Fundamental/Engine/bootstrap_sqlite.js','Fundamental/Engine/fundamental_service.js',
  'Fundamental/Engine/observability_v3.js','Fundamental/Engine/source_discovery.js',
  'Fundamental/Providers/calendar_provider.js','Fundamental/Providers/fedwatch_provider.js',
  'Fundamental/Providers/rss_provider.js','Fundamental/Providers/web_provider.js',
  'Indicators/Engine/indicator_language.js','Indicators/Engine/indicator_registry.js',
  'Indicators/Engine/indicator_service.js',
  'MarketData/Config/market_data_settings.js',
  'MarketData/Orchestrator/weighted_request_profile_v1.js',
  'Strategy/Engine/strategy_service.js','Strategy/Engine/strategy_stats_v2.js',
  'Supervisor/supervisor_service.js'
 ]
});
const map=new Map();
for(const [group,files] of Object.entries(GROUPS)){
 for(const file of files){
  if(map.has(file))throw Error('P22_TRIAGE_DUPLICATE:'+file);
  map.set(file,group);
 }
}
function classify(file){return map.get(file)||null;}
module.exports={GROUPS,classify,COUNT:map.size};
