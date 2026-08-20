import yaml
import subprocess

def run(user_message: str) -> str:
    # Read configuration
    with open("config/config.yaml", "r") as file:
        config = yaml.safe_load(file)
    model_name = config['model']['name']
    mcp_servers = config['mcp_servers']

    # Connect to the MCP server
    try:
        mcp_server = mcp_servers[0]
        command = f"{mcp_server['command']} {mcp_server['args'][0]} {mcp_server['args'][1]} {mcp_server['args'][2]}"
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            raise Exception(f"Failed to connect to MCP server: {stderr}")

        # Get list of tools
        process = subprocess.Popen(f"{mcp_server['command']} tools/list", stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            raise Exception(f"Failed to get tools list from MCP server: {stderr}")

        # Call ollama.chat()
        tools = yaml.safe_load(stdout)
        response = ollama.chat(model=model_name, message=user_message, tools=tools)

        # Process tool_calls if any
        if 'tool_calls' in response:
            for call in response['tool_calls']:
                process = subprocess.Popen(f"{mcp_server['command']} tools/call", input=yaml.dump(call), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
                stdout, stderr = process.communicate()
                if process.returncode != 0:
                    raise Exception(f"Failed to execute tool call on MCP server: {stderr}")
                response['tools'][call['name']] = stdout

        return response['text']

    except Exception as e:
        return f"Error: {str(e)}"