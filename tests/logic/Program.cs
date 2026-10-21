// Runs the logic suites. Neither needs a database or a running API: they
// check DrawBuilder and BoutScheduler against the rules the signed Phase 3
// document states, which is the part most worth holding still.
using Smf.Tests;

var failures = 0;

Console.WriteLine("### REQ-10 — the draw ###");
failures += DrawTests.Run();

Console.WriteLine();
Console.WriteLine("### REQ-11 — the schedule ###");
failures += ScheduleTests.Run();

Console.WriteLine();
Console.WriteLine(failures == 0 ? "ALL SUITES PASSED" : "SOME SUITES FAILED");
return failures == 0 ? 0 : 1;
