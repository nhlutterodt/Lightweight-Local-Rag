import React from 'react';

function CollectionInput({ collectionName, setCollectionName, recentCollections }) {
  return (
    <div className="nav-item">
      <label htmlFor="collectionName">Collection</label>
      <input
        type="text"
        id="collectionName"
        value={collectionName}
        onChange={(event) => setCollectionName(event.target.value)}
        placeholder="Collection Name..."
        list="recentCollections"
      />
      <datalist id="recentCollections">
        {recentCollections.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}

export default CollectionInput;
