#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
# Node 22, npm ci in App; Playwright + Firefox for UI tests.
# This suite never starts Trading Engine or contacts GEN-1.
IATB_BROWSER_QA=1 IATB_FIREFOX_CONTAINER="${IATB_FIREFOX_CONTAINER:-0}" node --test --test-concurrency=1 App/Tools/Tests/*.test.js
node --test --test-concurrency=1 \
 App/Indicators/Tests/test_indicator_analysis_v1.js \
 App/Indicators/Tests/test_indicator_complete_v2.js \
 App/Indicators/Tests/test_indicator_engine.js \
 App/Indicators/Tests/test_indicator_ir_v2.js \
 App/Indicators/Tests/test_indicator_language_v2.js \
 App/Indicators/Tests/test_indicator_settings_v1.js
IATB_FIREFOX_CONTAINER="${IATB_FIREFOX_CONTAINER:-0}" node --test --test-concurrency=1 \
 App/UI/Tests/test_indicator_visual_v2.js \
 App/UI/Tests/test_chart_drawing_contract_v21.js \
 App/UI/Tests/test_chart_workspace_v21.js
