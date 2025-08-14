import AssetList from "@/components/AssetList";
import AssetControls from "@/components/AssetControls";
import Filters from "@/components/Filters";
import Form from "@/components/Form";
import SnackBar from "@/components/SnackBar";
import Footer from "@/components/Footer";
import TotalValue from "@/components/TotalValue";
import Login from "@/components/Login";
import useSWR from "swr";
import axios from "axios";
import { GOOGLE_FONT_PROVIDER } from "next/dist/shared/lib/constants";
import { useEffect, useState } from "react";

export default function App() {
  const initialAssets = [
    { id: 0, name: "Bitcoin", quantity: 0.01288, notes: "", type: "crypto", abb: "btc", value: 10_000, baseValue: 40_000, isDeleted: false },
    { id: 1, name: "Ethereum", quantity: 0.029, notes: "", type: "crypto", abb: "eth", value: 10_000, baseValue: 4_000, isDeleted: false },
    { id: 2, name: "Silver", quantity: 754, notes: "", type: "metals", abb: "silver", value: 10_000, baseValue: 20.7, isDeleted: false },
    {
      id: 3,
      name: "Gold",
      quantity: 3.5,
      notes: "recently bought",
      type: "metals",
      abb: "gold",
      value: 10_000,
      baseValue: 1_900,
      isDeleted: false,
    },
    { id: 4, name: "Euro", quantity: 200, notes: "under the Pillow", type: "cash", abb: "eur", value: 200, baseValue: 1, isDeleted: false },
    { id: 5, name: "Beach house", quantity: 1, notes: "I wish", type: "real_estate", abb: "RE", value: 1, baseValue: 1, isDeleted: false },
  ];
  const [assets, setAssets] = useState(initialAssets);

  const apiClient = axios.create({
    baseURL: "/api",
    headers: {
      "Content-Type": "application/json",
    },
  });

  async function fetchCryptoValueFromApi(fromCurrency) {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=EUR&apikey=${process.env.NEXT_PUBLIC_ALPHAVANTAGE}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const content = data?.["Realtime Currency Exchange Rate"];
      console.log("API", content?.["1. From_Currency Code"], "to", content?.["3. To_Currency Code"], content?.["5. Exchange Rate"]);
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchStockValueFromApi(symbol) {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.NEXT_PUBLIC_ALPHAVANTAGE}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const content = data?.["Global Quote"];
      console.log("API", content?.["01. symbol"], content?.["05. price"]);
    } catch (error) {
      console.error(error);
    }
  }

  const { data: user, isLoading, error, mutate } = useSWR("/api/user");

  useEffect(() => {
    if (!user) {
      return;
    }
    setAssets(user.assets);
    fetchCryptoValueFromApi("BTC");
    fetchStockValueFromApi("IBM");
  }, [user]);

  function handleFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const formProps = Object.fromEntries(formData);
    console.log(formProps);
    if (formProps.id) {
      //handle asset edits
      const assetToUpdate = userAssets.find((asset) => asset._id === Number(formProps.id));
      editAsset(Number(formProps.id), { quantity: formProps.quantity, notes: formProps.notes });
      // displayToast(`"${assetToUpdate.name}" was updated.`);
    } else {
      //handle asset creation
      const newAsset = {
        ...formProps,
        value: 0,
        baseValue: 0,
        isDeleted: false,
        // id: userAssets.length,
        abb: "", // TO DO
      };
      addAsset(newAsset);
      // displayToast(`Asset ${newAsset.name} was created.`);
    }
    resetForm();
  }

  function resetForm() {
    setCurrentAssetId(null);
    const assetForm__typeField = document.querySelector("#assetTypeField");
    const assetForm__nameField = document.querySelector("#assetNameField");
    const assetForm__quantityField = document.querySelector("#assetQuantityField");
    const assetForm__notesField = document.querySelector("#assetNotesField");

    assetForm__typeField.parentElement.classList.remove("is-dirty", "is-upgraded");
    assetForm__nameField.parentElement.classList.remove("is-dirty", "is-upgraded");
    assetForm__quantityField.parentElement.classList.remove("is-dirty", "is-upgraded");
    assetForm__notesField.parentElement.classList.remove("is-dirty", "is-upgraded");
    setFormIsVisible(false);
  }

  async function handleDeleteAsset(assetId) {
    // deleteAsset(id);
    try {
      const response = await apiClient.post(`/user`, {
        action: "softDelete",
        assetId,
      });
      console.log(response.data);
      // Weitere Aktionen...
    } catch (error) {
      console.error("Fehler beim Soft-Delete des Assets:", error);
    }
    // setUserAssets((prevUserAssets) => prevUserAssets.map((asset) => (asset.id === id ? { ...asset, isDeleted: true } : asset)));
    const assetName = userAssets.find((asset) => asset._id === assetId).name;
    // displaySnackbar(`"${assetName}" was deleted.`, "undo", () => {
    //   handleUnDeleteAsset(id);
    // });
  }

  async function handleUnDeleteAsset(assetId) {
    // unDeleteAsset(id);
    try {
      const response = await apiClient.post(`/user`, {
        action: "softUndelete",
        assetId,
      });
      console.log(response.data);
      // Weitere Aktionen...
    } catch (error) {
      console.error("Fehler beim Soft-Undelete des Assets:", error);
    }
    // setUserAssets((prevUserAssets) => prevUserAssets.map((asset) => (asset.id === id ? { ...asset, isDeleted: false } : asset)));
    const assetName = userAssets.find((asset) => asset._id === assetId).name;
    // displayToast(`"${assetName}" was restored successfully.`);
  }

  function handleEditAsset(id) {
    setCurrentAssetId(id);
    setFormIsVisible(true);

    //Handle Form Styling
    const assetForm__typeField = document.querySelector("#assetTypeField");
    const assetForm__nameField = document.querySelector("#assetNameField");
    const assetForm__quantityField = document.querySelector("#assetQuantityField");
    const assetForm__notesField = document.querySelector("#assetNotesField");

    assetForm__typeField.parentElement.classList.add("is-dirty", "is-upgraded");
    assetForm__nameField.parentElement.classList.add("is-dirty", "is-upgraded");
    assetForm__quantityField.parentElement.classList.add("is-dirty", "is-upgraded");
    assetForm__notesField.parentElement.classList.add("is-dirty", "is-upgraded");

    setTimeout(() => {
      //wait for form to render
      const assetFormContainer = document.querySelector(".assetFormContainer");
      assetFormContainer.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }

  function displayToast(error) {
    var notification = document.querySelector(".mdl-js-snackbar");
    notification.MaterialSnackbar.showSnackbar({
      message: error,
    });
  }

  function displaySnackbar(error, buttonText, buttonFunction) {
    var notification = document.querySelector(".mdl-js-snackbar");
    var data = {
      message: error,
      actionHandler: function () {
        buttonFunction();
      },
      actionText: buttonText,
      timeout: 4000,
    };
    notification.MaterialSnackbar.showSnackbar(data);
  }

  if (isLoading) {
    return <h1>Loading...</h1>;
  }

  if (!user) {
    return;
  }

  return (
    <>
      <div id="wrapper">
        <Login />
        <h1>Track your assets!</h1>
        <Form onFormSubmit={handleFormSubmit} resetForm={resetForm} />
        <div id="assetControls" className="layoutElement">
          <AssetControls />
        </div>
        {assets ? (
          <AssetList assets={assets} handleDeleteAsset={handleDeleteAsset} handleEditAsset={handleEditAsset}></AssetList>
        ) : (
          "Please add assets!"
        )}
        <Footer>
          <TotalValue value={assets.reduce((sum, asset) => sum + asset.value, 0)} />
        </Footer>
        <SnackBar />
      </div>
    </>
  );
}
