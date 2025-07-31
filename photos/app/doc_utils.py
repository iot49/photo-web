import textwrap

import markdown


def dedent_and_convert_to_html(md_string: str) -> str:
    """
    Dedents a markdown string and converts it to HTML.
    """
    return markdown.markdown(textwrap.dedent(md_string))
