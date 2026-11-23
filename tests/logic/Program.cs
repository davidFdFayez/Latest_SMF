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
Console.WriteLine("### REQ-01 — the weight classes ###");
failures += WeightClassTests.Run();

Console.WriteLine();
Console.WriteLine("### REQ-02 — competition age, categories and divisions ###");
failures += Req02Tests.Run();

Console.WriteLine();
Console.WriteLine("### Terms & Conditions — rich text cleaning ###");
failures += RichTextTests.Run();

Console.WriteLine();
Console.WriteLine("### Draw Management — BYE arithmetic, 0 to 128 athletes ###");
failures += DrawMathTests.Run();

Console.WriteLine();
Console.WriteLine("### Draw Management — generated bracket, 0 to 128 athletes ###");
failures += DrawGenerationTests.Run();

Console.WriteLine();
Console.WriteLine("### Tournament banner — position and zoom ###");
failures += BannerCropTests.Run();

Console.WriteLine();
Console.WriteLine("### REQ-09 — the accepted weigh-in range ###");
failures += WeighInRangeTests.Run();

Console.WriteLine();
Console.WriteLine("### REQ-10 — the bracket test matrix ###");
failures += BracketMatrixTests.Run();

Console.WriteLine();
Console.WriteLine("### REG-11 — the athlete's current weight on the membership record ###");
failures += MemberWeightTests.Run();

Console.WriteLine();
Console.WriteLine("### Draw engine remediation — club separation and draw integrity ###");
failures += DrawRemediationTests.Run();

Console.WriteLine();
Console.WriteLine(failures == 0 ? "ALL SUITES PASSED" : "SOME SUITES FAILED");
return failures == 0 ? 0 : 1;
