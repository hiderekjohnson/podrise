#!/bin/bash
COOKIE_FILE=/home/runner/workspace/.pulse_cookies.txt

curl -s -c "$COOKIE_FILE" -b "$COOKIE_FILE" -X POST http://localhost:5000/api/admin/login -H "Content-Type: application/json" -d '{"password":"tatango123"}' > /dev/null

DATE="2026-03-13"
SUCCESS=0
SKIPPED=0
FAILED=0
TOTAL=37

generate() {
  local slug="$1"
  local name="$2"
  local num="$3"
  
  echo "[$num/$TOTAL] $name ($slug)..."
  
  RESULT=$(curl -s -b "$COOKIE_FILE" -X POST "http://localhost:5000/api/admin/topics/$slug/pulse/generate" \
    -H "Content-Type: application/json" \
    -d "{\"date\":\"$DATE\",\"topicName\":\"$name\"}" \
    --max-time 120 2>&1)
  
  if echo "$RESULT" | grep -q '"headline"'; then
    echo "  ✓ Generated"
    SUCCESS=$((SUCCESS + 1))
  elif echo "$RESULT" | grep -q 'No relevant episodes'; then
    echo "  - No episodes"
    SKIPPED=$((SKIPPED + 1))
  else
    echo "  ✗ Error: $(echo "$RESULT" | head -c 200)"
    FAILED=$((FAILED + 1))
  fi
}

N=0
N=$((N+1)); generate "ai" "Artificial Intelligence" $N
N=$((N+1)); generate "entrepreneurship" "Entrepreneurship" $N
N=$((N+1)); generate "startups" "Startups" $N
N=$((N+1)); generate "venture-capital" "Venture Capital" $N
N=$((N+1)); generate "investing" "Investing" $N
N=$((N+1)); generate "personal-finance" "Personal Finance" $N
N=$((N+1)); generate "leadership" "Leadership" $N
N=$((N+1)); generate "marketing" "Marketing" $N
N=$((N+1)); generate "sales" "Sales" $N
N=$((N+1)); generate "productivity" "Productivity" $N
N=$((N+1)); generate "decision-making" "Decision Making" $N
N=$((N+1)); generate "technology" "Technology" $N
N=$((N+1)); generate "economics" "Economics" $N
N=$((N+1)); generate "future-of-work" "Future of Work" $N
N=$((N+1)); generate "health-longevity" "Health & Longevity" $N
N=$((N+1)); generate "psychology" "Psychology" $N
N=$((N+1)); generate "peak-performance" "Peak Performance" $N
N=$((N+1)); generate "self-improvement" "Self Improvement" $N
N=$((N+1)); generate "negotiation" "Negotiation" $N
N=$((N+1)); generate "career-growth" "Career Growth" $N
N=$((N+1)); generate "creativity" "Creativity" $N
N=$((N+1)); generate "media-content" "Media & Content" $N
N=$((N+1)); generate "geopolitics" "Geopolitics" $N
N=$((N+1)); generate "creator-economy" "Creator Economy" $N
N=$((N+1)); generate "saas" "SaaS" $N
N=$((N+1)); generate "open-source" "Open Source" $N
N=$((N+1)); generate "product-management" "Product Management" $N
N=$((N+1)); generate "product-market-fit" "Product Market Fit" $N
N=$((N+1)); generate "automation" "Automation" $N
N=$((N+1)); generate "robotics" "Robotics" $N
N=$((N+1)); generate "crypto-web3" "Crypto & Web3" $N
N=$((N+1)); generate "climate-energy" "Climate & Energy" $N
N=$((N+1)); generate "defense-tech" "Defense Tech" $N
N=$((N+1)); generate "women-in-business" "Women in Business" $N
N=$((N+1)); generate "young-entrepreneurs" "Young Entrepreneurs" $N
N=$((N+1)); generate "bootstrapping" "Bootstrapping" $N
N=$((N+1)); generate "side-hustles" "Side Hustles" $N

echo ""
echo "===== COMPLETE ====="
echo "Generated: $SUCCESS | Skipped: $SKIPPED | Failed: $FAILED"
