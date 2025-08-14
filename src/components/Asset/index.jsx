// import styles from "./Asset.module.css";
import PropTypes from "prop-types";
export default function Asset({ asset, handleEditAsset, handleDeleteAsset }) {
  return (
    <div className={`demo-card-square mdl-card mdl-shadow--2dp ${asset.type}`} id={asset._id}>
      <div className="mdl-card__title mdl-card--expand">
        <h2 className="mdl-card__title-text">{asset.name}</h2>
      </div>
      <div className="mdl-card__supporting-text">
        {asset.quantity}
        <br />
        {/* Value: {(asset.baseValue * asset.quantity)?.toLocaleString("de-DE")}€ ({asset.baseValue?.toLocaleString("de-DE")}€) */}
        Value: {asset.value?.toLocaleString("de-DE")}€ ({asset.baseValue?.toLocaleString("de-DE")}€)
        <br />
        Notes: {asset.notes}
      </div>
      <div className="mdl-card__actions mdl-card--border">
        <button
          className="mdl-button mdl-button--colored mdl-js-button mdl-js-ripple-effect"
          id={`${asset.id}-edit-button`}
          //   onClick={() => displayAssetForm(asset.id)}
          onClick={() => handleEditAsset(asset._id)}
        >
          edit
        </button>
        <button
          className="mdl-button mdl-button--colored mdl-js-button mdl-js-ripple-effect"
          id={`${asset.id}-delete-button`}
          onClick={() => handleDeleteAsset(asset._id)}
        >
          delete
        </button>
      </div>
    </div>
  );
}

Asset.propTypes = {
  asset: PropTypes.object.isRequired,
  handleEditAsset: PropTypes.func.isRequired,
  handleDeleteAsset: PropTypes.func.isRequired,
};
