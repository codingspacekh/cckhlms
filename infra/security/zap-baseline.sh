#!/bin/sh
# OWASP ZAP baseline scan (M7, docs/security-review.md): ZAP crawls the site for a few minutes and reports what
# it sees, without attacking it. Fails if any alert is High. Run against the production build locally (M7) and
# against https://lms.cckh.dev at G1.
#
#   sh infra/security/zap-baseline.sh <start URL> <report name> [cookie header]
#
# With a cookie (for example "__Secure-better-auth.session_token=…"), ZAP sends it on every request, so it crawls
# that person's pages too. Reports go to test-results/zap/<report name>/.
set -eu
cd "$(dirname "$0")/../.."
target=${1:?start URL}
name=${2:?report name}
cookie=${3:-}
out="test-results/zap/$name"
mkdir -p "$out" && chmod 777 "$out"

# The spider follows links but doesn't submit forms: a signed-in crawl would otherwise sign itself out or change data.
set -- zap-baseline.py -t "$target" -m 3 -J report.json -r report.html -I
if [ -z "$cookie" ]; then
  set -- "$@" -z "-config spider.postForm=false"
else
  # A replacer rule adds the Cookie header to every request ZAP makes.
  set -- "$@" -z "-config spider.postForm=false -config replacer.full_list(0).description=session -config replacer.full_list(0).enabled=true \
-config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstr=Cookie \
-config replacer.full_list(0).regex=false -config replacer.full_list(0).replacement=$cookie"
fi
docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD/$out:/zap/wrk" ghcr.io/zaproxy/zaproxy:2.17.0 "$@" >"$out/zap.log" 2>&1 || true

[ -s "$out/report.json" ] || { echo "FAIL: ZAP wrote no report (see $out/zap.log)"; exit 1; }
python3 - "$out/report.json" >"$out/summary.txt" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
for site in r["site"]:
    for a in sorted(site["alerts"], key=lambda a: -int(a["riskcode"])):
        print(f'{a["riskdesc"]}\t{a["name"]}\t{a["count"]} URL(s)')
EOF
cat "$out/summary.txt"
urls=$(sed -n 's/.*Total of \([0-9]*\) URLs.*/\1/p' "$out/zap.log" | head -n 1)
high=$(grep -c '^High' "$out/summary.txt" || true)
echo "$name: ${urls:-?} URLs crawled, $high high-risk alert(s); report: $out/report.html"
[ "$high" = 0 ]
