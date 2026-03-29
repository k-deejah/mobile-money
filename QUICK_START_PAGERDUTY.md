# Quick Start: PagerDuty Integration

Get alerts on provider errors in 5 minutes.

## 1. Get PagerDuty Integration Key (2 minutes)

1. Go to [PagerDuty Dashboard](https://app.pagerduty.com)
2. Services → Click your service
3. Integrations tab → "New Integration"
4. Choose "Events API V2" → Copy **Routing Key**

## 2. Configure Environment (1 minute)

Add to `.env`:
```bash
PAGERDUTY_INTEGRATION_KEY=Rxxx...xxx
```

Or in deployment platform (Heroku, k8s, etc.):
```bash
export PAGERDUTY_INTEGRATION_KEY=Rxxx...xxx
```

## 3. Restart Application (1 minute)

```bash
npm run dev
# or
docker-compose restart
```

Check logs:
```
PagerDuty monitoring service started
```

## 4. Test It Works (1 minute)

In development environment, trigger test errors:

```bash
# In your Node shell:
node -e "
const {createPagerDutyService} = require('./dist/services/pagerDutyService');
const svc = createPagerDutyService();

// Simulate 16% error rate (above 15% threshold)
for(let i=0; i<84; i++) svc.recordProviderSuccess('stripe');
for(let i=0; i<16; i++) svc.recordProviderError('stripe', Date.now());

console.log('Error rate:', (svc.getErrorRate('stripe')*100).toFixed(2) + '%');
"
```

## You're Done! 🎉

The system is now monitoring provider error rates and will:
- ✅ Send CRITICAL alerts when errors exceed 15%
- ✅ Auto-resolve when errors drop below 15%
- ✅ Only alert when necessary

## Next Steps

- Configure PagerDuty escalation policies
- Set up mobile notifications
- Integrate with Slack/email
- Review [Full Documentation](./PAGERDUTY_INTEGRATION.md)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No alerts | Verify `PAGERDUTY_INTEGRATION_KEY` in logs |
| Too many alerts | Increase threshold from 15% to 20% |
| Can't restart | Run `npm run build` first |

Questions? See [PAGERDUTY_INTEGRATION.md](./PAGERDUTY_INTEGRATION.md)
