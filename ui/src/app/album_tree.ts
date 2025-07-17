import { Albums, AlbumModel } from "./interfaces";

export interface TreeNode {
    name: string | undefined;
    nodes: TreeNode[];
    albums: AlbumModel[];
}

export function album_tree(albums: Albums): TreeNode {
    const root: TreeNode = {
        name: undefined,
        nodes: [],
        albums: [],
    };

    // Helper function to get or create a node
    function getOrCreateNode(currentNode: TreeNode, pathParts: string[]): TreeNode {
        if (pathParts.length === 0) {
            return currentNode;
        }

        const name = pathParts[0];
        let nextNode = currentNode.nodes.find(node => node.name === name);

        if (!nextNode) {
            nextNode = {
                name: name,
                nodes: [],
                albums: [],
            };
            currentNode.nodes.push(nextNode);
        }

        return getOrCreateNode(nextNode, pathParts.slice(1));
    }

    for (const uuid in albums) {
        if (albums.hasOwnProperty(uuid)) {
            const album = albums[uuid];
            const pathParts = album.path.split('/').filter(part => part !== '');
            const targetNode = getOrCreateNode(root, pathParts);
            targetNode.albums.push(album);
        }
    }

    // Sort nodes and albums
    function sortTree(node: TreeNode) {
        node.nodes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        node.albums.sort((a, b) => a.title.localeCompare(b.title));
        node.nodes.forEach(sortTree);
    }

    sortTree(root);

    return root;
}
