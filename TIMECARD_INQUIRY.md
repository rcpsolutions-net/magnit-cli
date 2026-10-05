# Draft: Magnit timecard API inquiry

Not sent. Edit the bracketed parts, then send to your Magnit Program Representative (and/or Bullhorn VMS Support).

---

**To:** [Magnit Program Representative]  ·  **Cc:** [Bullhorn VMS Support, if sending to both]
**Subject:** API access for timecard data — [Client/Program name]

Hi [name],

We're building an integration to pull timecard data out of Magnit (WAND) for [reconciliation against our Bullhorn timesheets / payroll]. The Magnit API reference we have (v1.1) and the Gateway API cover requests, workers, reference data and candidates, but no timecards, so we plan to use Reporting as a Service. Could you help with the following?

1. **RaaS access:** please enable RaaS permission for [our user / API user] and confirm which user type (supplier or client) we should use.
2. **Timecard report:** which Customizable Report data source contains timecard lines? We need Billing Line #, engagement, worker, work date, time in/out, labor type, no-lunch flag, hours, billing notes, and approval status. If there is a standard template, could you share it or its report ID?
3. **Scope:** will a supplier-user report return all of our workers' timecards, or only some? Is there any limit on how far back we can pull?
4. **Other options:** is there a timecard/time-entry feed in the Magnit Integration API or Gateway API (inbound or outbound) that isn't in the public documents? If so, please send the specification and the feed identifier(s) for our program.
5. **Time Source:** we've seen that Time Source must be `WAND` for timecards to flow into Bullhorn — is that a Magnit-side setting, and does it affect what we can pull?
6. **Sandbox:** could we get sandbox credentials (CSOL3 or WEB03 for US) to test before touching production?
7. **Integration API details** (only if we also get Integration API credentials): please confirm the `request-status` endpoints for each feed, and whether the onboarding endpoint is `/api/onboarding/inbound/request` or `/onboarding/inbound/request` relative to the `/api/` base URL.

Context: Bullhorn VMS Sync lists "Magnit API" as a supported VMS; we're not sure how time reaches Bullhorn today. [Optional: we're also asking Bullhorn how their Magnit connector retrieves time.]

Thanks,
Lawrence Ham
RCP Solutions, LLC · lham@rcpsolutions.net
