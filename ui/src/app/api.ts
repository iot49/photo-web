export async function get_json(uri: string) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, { method: 'GET', credentials: 'include', mode: 'cors' });
    } catch (error) {
      throw new Error(`Failed fetching ${uri}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed fetching ${uri}`, { cause: error });
  }
}


export async function get_text(uri: string) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, { method: 'GET', credentials: 'include', mode: 'cors' });
    } catch (error) {
      throw new Error(`Failed fetching ${uri}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Failed fetching ${uri}`, { cause: error });
  }
}

export async function post_json(uri: string, data?: any) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, {
        method: 'POST',
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined
      });
    } catch (error) {
      console.error(`Failed posting to ${uri}`, { cause: error });
      return;
    }
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} for POST ${uri}`);
      return;
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed posting to ${uri}`, { cause: error });
  }
}

export async function put_json(uri: string, data?: any) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, {
        method: 'PUT',
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined
      });
    } catch (error) {
      console.error(`Failed putting to ${uri}`, { cause: error });
      return;
    }
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} for PUT ${uri}`);
      return;
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed putting to ${uri}`, { cause: error });
  }
}

export async function get_blob(uri: string) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, { method: 'GET', credentials: 'include', mode: 'cors' });
    } catch (error) {
      console.error(`Failed fetching ${uri}`, { cause: error });
      return;
    }
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} for GET ${uri}`);
      return;
    }
    return await response.blob();
  } catch (error) {
    console.error(`Failed fetching ${uri}`, { cause: error });
  }
}

export async function delete_json(uri: string) {
  try {
    let response: Response;
    try {
      response = await fetch(uri, {
        method: 'DELETE',
        credentials: 'include',
        mode: 'cors',
      });
    } catch (error) {
      console.error(`Failed deleting ${uri}`, { cause: error });
      return;
    }
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} for DELETE ${uri}`);
      return;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed deleting ${uri}`, { cause: error });
  }
}
