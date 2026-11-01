"""Anonymous real-network smoke check with the official MCP SDK client."""

import argparse
import asyncio

from mcp import Client


async def smoke(url):
    async with Client(url) as client:
        tools = await client.list_tools()
        names = {tool.name for tool in tools.tools}
        assert {'list_datasets','search_events','query_regional_data','get_reliability_report'} <= names
        for name in ('list_datasets','get_reliability_report'):
            result = await client.call_tool(name,{'limit':1})
            assert not result.is_error, f'{name} returned an error'
            assert result.structured_content is not None
        print('Anonymous SDK discovery, catalog and reliability report succeeded.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    asyncio.run(smoke(parser.parse_args().url))
