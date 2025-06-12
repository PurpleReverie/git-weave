using System.CommandLine;

var root = new RootCommand("weave");

var init_command = new Command("init", "Initialize weave in your repo. Scan sub folders for weave-child config files and update your git repo accordingly, and will then attempt to pull");
init_command.SetHandler(() =>
{
    Console.WriteLine("Init invoked");
});

var sync_command = new Command("sync", "Attempts to pull all child repos");
sync_command.SetHandler(() =>
{
    Console.WriteLine("Sync invoked");
});

root.AddCommand(init_command);
root.AddCommand(sync_command);

await root.InvokeAsync(args);

// See https://aka.ms/new-console-template for more information
Console.WriteLine("Hello, World!");

