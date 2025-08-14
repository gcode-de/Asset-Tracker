import PropTypes from "prop-types";

export default function AssetControls({ handleUpdateValues }) {
  return (
    <>
      <div className="buttons">
        <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" id="addAssetButton" onClick={() => {}}>
          Add Asset
        </button>
        <button className="mdl-button mdl-js-button mdl-button--raised mdl-button--colored" id="updateValuesButton" onClick={handleUpdateValues}>
          Update Values
        </button>
      </div>
    </>
  );
}

AssetControls.propTypes = {
  handleUpdateValues: PropTypes.func.isRequired,
};
