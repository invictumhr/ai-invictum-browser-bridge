using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

internal static class InvictumNativeHostLauncher
{
    private const string NodePathFile = "node-path.txt";
    private const string HostEntryPathFile = "host-entry-path.txt";
    private const string DesktopUrlFile = "desktop-url.txt";

    public static int Main(string[] args)
    {
        try
        {
            string launcherDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string nodePath = ReadRequiredPath(launcherDirectory, NodePathFile);
            string hostEntryPath = ReadRequiredPath(launcherDirectory, HostEntryPathFile);
            string desktopUrl = ReadRequiredText(launcherDirectory, DesktopUrlFile);
            Uri parsedDesktopUrl;
            if (!Uri.TryCreate(desktopUrl, UriKind.Absolute, out parsedDesktopUrl) ||
                parsedDesktopUrl.Scheme != "ws" ||
                parsedDesktopUrl.Host != "127.0.0.1")
            {
                throw new InvalidDataException("The configured desktop URL must use ws://127.0.0.1.");
            }

            var forwardedArguments = new List<string>();
            forwardedArguments.Add(QuoteArgument(hostEntryPath));
            forwardedArguments.Add(QuoteArgument("--desktop-url=" + desktopUrl));
            foreach (string argument in args)
            {
                forwardedArguments.Add(QuoteArgument(argument));
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = string.Join(" ", forwardedArguments.ToArray()),
                WorkingDirectory = Path.GetDirectoryName(hostEntryPath),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = false
            };

            using (Process child = Process.Start(startInfo))
            {
                if (child == null)
                {
                    Console.Error.WriteLine("Invictum native host launcher could not start Node.js.");
                    return 1;
                }

                Stream chromeInput = Console.OpenStandardInput();
                Stream chromeOutput = Console.OpenStandardOutput();
                Stream nodeInput = child.StandardInput.BaseStream;
                Stream nodeOutput = child.StandardOutput.BaseStream;

                Task inputPump = Task.Run(delegate
                {
                    Pump(chromeInput, nodeInput, true);
                });
                Task outputPump = Task.Run(delegate
                {
                    Pump(nodeOutput, chromeOutput, false);
                });

                child.WaitForExit();
                outputPump.Wait();
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Invictum native host launcher failed: " + error.Message);
            return 1;
        }
    }

    private static void Pump(Stream source, Stream destination, bool closeDestinationOnEnd)
    {
        byte[] buffer = new byte[81920];
        try
        {
            int bytesRead;
            while ((bytesRead = source.Read(buffer, 0, buffer.Length)) > 0)
            {
                destination.Write(buffer, 0, bytesRead);
                destination.Flush();
            }
        }
        catch (IOException)
        {
            // A closed Chrome or Node pipe is the normal native-host shutdown path.
        }
        catch (ObjectDisposedException)
        {
            // The peer process can close its stream while the other pump is active.
        }
        finally
        {
            if (closeDestinationOnEnd)
            {
                try
                {
                    destination.Close();
                }
                catch (IOException)
                {
                    // The child may already have exited.
                }
            }
        }
    }

    private static string ReadRequiredPath(string directory, string fileName)
    {
        string configurationPath = Path.Combine(directory, fileName);
        if (!File.Exists(configurationPath))
        {
            throw new FileNotFoundException("Missing launcher configuration file", configurationPath);
        }

        string configuredPath = File.ReadAllText(configurationPath, Encoding.UTF8).Trim();
        string absolutePath = Path.GetFullPath(configuredPath);
        if (!File.Exists(absolutePath))
        {
            throw new FileNotFoundException("Configured executable or entry point does not exist", absolutePath);
        }

        return absolutePath;
    }

    private static string ReadRequiredText(string directory, string fileName)
    {
        string configurationPath = Path.Combine(directory, fileName);
        if (!File.Exists(configurationPath))
        {
            throw new FileNotFoundException("Missing launcher configuration file", configurationPath);
        }

        return File.ReadAllText(configurationPath, Encoding.UTF8).Trim();
    }

    private static string QuoteArgument(string value)
    {
        var result = new StringBuilder();
        result.Append('"');
        int backslashCount = 0;

        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashCount += 1;
                continue;
            }

            if (character == '"')
            {
                result.Append('\\', backslashCount * 2 + 1);
                result.Append('"');
                backslashCount = 0;
                continue;
            }

            result.Append('\\', backslashCount);
            backslashCount = 0;
            result.Append(character);
        }

        result.Append('\\', backslashCount * 2);
        result.Append('"');
        return result.ToString();
    }
}
